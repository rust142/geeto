# typed: false
# frozen_string_literal: true

# Homebrew formula for Geeto CLI
# Install: brew tap rust142/geeto && brew install geeto

class Geeto < Formula
  desc "AI-powered Git workflow automation CLI"
  homepage "https://github.com/rust142/geeto"
  version "0.3.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.intel?
      url "https://github.com/rust142/geeto/releases/download/v#{version}/geeto-mac"
      sha256 "" # TODO: fill after first release with binaries

      def install
        bin.install "geeto-mac" => "geeto"
      end
    elsif Hardware::CPU.arm?
      url "https://github.com/rust142/geeto/releases/download/v#{version}/geeto-mac-arm64"
      sha256 "" # TODO: fill after first release with binaries

      def install
        bin.install "geeto-mac-arm64" => "geeto"
      end
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/rust142/geeto/releases/download/v#{version}/geeto-linux"
      sha256 "" # TODO: fill after first release with binaries

      def install
        bin.install "geeto-linux" => "geeto"
      end
    elsif Hardware::CPU.arm?
      url "https://github.com/rust142/geeto/releases/download/v#{version}/geeto-linux-arm64"
      sha256 "" # TODO: fill after first release with binaries

      def install
        bin.install "geeto-linux-arm64" => "geeto"
      end
    end
  end

  test do
    assert_match "Geeto v#{version}", shell_output("#{bin}/geeto --version")
  end
end
